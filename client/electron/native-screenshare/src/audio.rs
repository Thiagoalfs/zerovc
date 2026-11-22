use crate::Args;
use livekit::webrtc::audio_frame::AudioFrame;
use livekit::webrtc::audio_source::native::NativeAudioSource;
use std::borrow::Cow;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// 10ms @ 48kHz stereo = 480 samples per channel, 960 i16 samples total
const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u32 = 2;
const SAMPLES_PER_CHANNEL: u32 = 480;

#[cfg(target_os = "windows")]
pub async fn run_audio_capture(
    args: Args,
    source: NativeAudioSource,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    use std::process::Stdio;
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    let helper_path = args
        .audio_helper
        .ok_or_else(|| "Windows audio helper path not provided".to_string())?;

    if args.self_pid == 0 {
        return Err("self_pid is required to exclude ZeroVC audio".into());
    }

    let mut cmd = Command::new(&helper_path);
    cmd.args(["--zerovc-pid", &args.self_pid.to_string()]);
    if args.source_id.starts_with("window:") {
        // Window capture: INCLUDE only that window's process tree (never captures ZeroVC)
        let parts: Vec<&str> = args.source_id.split(':').collect();
        let hwnd = parts.get(1).copied().unwrap_or("0");
        cmd.args(["--hwnd", hwnd, "--mode", "include"]);
    } else {
        // Full screen capture: EXCLUDE ZeroVC's entire process tree (zero voice echo)
        cmd.args(["--mode", "exclude"]);
    }

    cmd.stdout(Stdio::piped()).stderr(Stdio::null());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn zerovc-audio-capture.exe: {}", e))?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open audio helper stdout".to_string())?;

    // zerovc-audio-capture.exe outputs 48kHz stereo f32 interleaved PCM
    let frame_floats = (SAMPLES_PER_CHANNEL * CHANNELS) as usize;
    let mut raw_buf = vec![0u8; frame_floats * 4];
    let mut i16_buf = vec![0i16; frame_floats];

    while !stop.load(Ordering::Relaxed) {
        if stdout.read_exact(&mut raw_buf).await.is_err() {
            break;
        }
        for i in 0..frame_floats {
            let f = f32::from_le_bytes([
                raw_buf[i * 4],
                raw_buf[i * 4 + 1],
                raw_buf[i * 4 + 2],
                raw_buf[i * 4 + 3],
            ]);
            i16_buf[i] = (f.clamp(-1.0, 1.0) * 32767.0) as i16;
        }
        let frame = AudioFrame {
            data: Cow::Borrowed(&i16_buf),
            sample_rate: SAMPLE_RATE,
            num_channels: CHANNELS,
            samples_per_channel: SAMPLES_PER_CHANNEL,
        };
        if source.capture_frame(&frame).await.is_err() {
            break;
        }
    }

    let _ = child.kill().await;
    Ok(())
}

#[cfg(target_os = "linux")]
pub async fn run_audio_capture(
    args: Args,
    source: NativeAudioSource,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    use std::collections::HashSet;
    use std::process::Stdio;
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    let my_pid = std::process::id();
    let node_name = format!("zerovc-screenshare-audio-{}", my_pid);

    // Match Electron's proven PipeWire flags: --target 0 + node.autoconnect=false + stream.capture.sink=false
    // prevents WirePlumber from auto-linking the microphone or the default sink monitor (which contains ZeroVC).
    let mut child = Command::new("pw-record")
        .args([
            "--target",
            "0",
            "-P",
            &format!("node.name={}", node_name),
            "-P",
            "node.autoconnect=false",
            "-P",
            "stream.capture.sink=false",
            "--raw",
            "--format",
            "s16",
            "--rate",
            "48000",
            "--channels",
            "2",
            "--channel-map",
            "Stereo",
            "-",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn pw-record for PipeWire audio capture: {}", e))?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to open pw-record stdout".to_string())?;

    // Background linker: connects every Stream/Output/Audio EXCEPT ZeroVC's process tree
    // and actively disconnects any unwanted auto-links into our capture node.
    let linker_stop = stop.clone();
    let linker_node = node_name.clone();
    let self_pid = args.self_pid;
    let linker_task = tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;

        while !linker_stop.load(Ordering::Relaxed) {
            let mut excluded_pids = collect_process_tree(self_pid);
            excluded_pids.insert(my_pid);

            if let Ok(output) = Command::new("pw-dump").output().await {
                if output.status.success() {
                    if let Ok(objs) = serde_json::from_slice::<Vec<serde_json::Value>>(&output.stdout) {
                        // 1. Find our capture node ID and its FL/FR input ports
                        let cap_node_id = objs.iter().find_map(|obj| {
                            if obj.get("type").and_then(|v| v.as_str()) != Some("PipeWire:Interface:Node") {
                                return None;
                            }
                            if obj.pointer("/info/props/node.name").and_then(|v| v.as_str()) == Some(linker_node.as_str()) {
                                obj.get("id").and_then(|v| v.as_u64())
                            } else {
                                None
                            }
                        });

                        if let Some(cap_nid) = cap_node_id {
                            let mut cap_fl: Option<u64> = None;
                            let mut cap_fr: Option<u64> = None;
                            let mut cap_port_ids: HashSet<u64> = HashSet::new();

                            for obj in &objs {
                                if obj.get("type").and_then(|v| v.as_str()) != Some("PipeWire:Interface:Port") {
                                    continue;
                                }
                                if obj.pointer("/info/props/node.id").and_then(|v| v.as_u64()) != Some(cap_nid) {
                                    continue;
                                }
                                if obj.pointer("/info/direction").and_then(|v| v.as_str()) != Some("input") {
                                    continue;
                                }
                                if let Some(pid) = obj.get("id").and_then(|v| v.as_u64()) {
                                    cap_port_ids.insert(pid);
                                    match obj.pointer("/info/props/audio.channel").and_then(|v| v.as_str()) {
                                        Some("FL") => cap_fl = Some(pid),
                                        Some("FR") => cap_fr = Some(pid),
                                        _ => {}
                                    }
                                }
                            }

                            if let (Some(fl_id), Some(fr_id)) = (cap_fl, cap_fr) {
                                // Collect existing links
                                let mut existing_links: HashSet<(u64, u64)> = HashSet::new();
                                for obj in &objs {
                                    if obj.get("type").and_then(|v| v.as_str()) != Some("PipeWire:Interface:Link") {
                                        continue;
                                    }
                                    if let (Some(o), Some(i)) = (
                                        obj.pointer("/info/output-port-id").and_then(|v| v.as_u64()),
                                        obj.pointer("/info/input-port-id").and_then(|v| v.as_u64()),
                                    ) {
                                        existing_links.insert((o, i));
                                    }
                                }

                                // 2. Identify allowed output nodes (Stream/Output/Audio excluding ZeroVC)
                                let mut allowed_node_ids: HashSet<u64> = HashSet::new();
                                for obj in &objs {
                                    if obj.get("type").and_then(|v| v.as_str()) != Some("PipeWire:Interface:Node") {
                                        continue;
                                    }
                                    let props = match obj.pointer("/info/props") {
                                        Some(p) => p,
                                        None => continue,
                                    };
                                    if props.get("media.class").and_then(|v| v.as_str()) != Some("Stream/Output/Audio") {
                                        continue;
                                    }
                                    let node_id = match obj.get("id").and_then(|v| v.as_u64()) {
                                        Some(id) => id,
                                        None => continue,
                                    };
                                    let pid_val = props
                                        .get("application.process.id")
                                        .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                                        .unwrap_or(0) as u32;
                                    let app_name = props
                                        .get("application.name")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_lowercase();
                                    let app_bin = props
                                        .get("application.process.binary")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_lowercase();

                                    if (pid_val != 0 && excluded_pids.contains(&pid_val))
                                        || app_name.contains("zerovc")
                                        || app_bin.contains("zerovc")
                                    {
                                        continue;
                                    }
                                    allowed_node_ids.insert(node_id);
                                }

                                // 3. Link allowed output ports (FL/FR/MONO) into our capture ports
                                let mut allowed_out_ports: HashSet<u64> = HashSet::new();
                                for obj in &objs {
                                    if obj.get("type").and_then(|v| v.as_str()) != Some("PipeWire:Interface:Port") {
                                        continue;
                                    }
                                    if obj.pointer("/info/direction").and_then(|v| v.as_str()) != Some("output") {
                                        continue;
                                    }
                                    let node_id = match obj.pointer("/info/props/node.id").and_then(|v| v.as_u64()) {
                                        Some(id) => id,
                                        None => continue,
                                    };
                                    if !allowed_node_ids.contains(&node_id) {
                                        continue;
                                    }
                                    let port_id = match obj.get("id").and_then(|v| v.as_u64()) {
                                        Some(id) => id,
                                        None => continue,
                                    };
                                    let ch = obj.pointer("/info/props/audio.channel").and_then(|v| v.as_str()).unwrap_or("");
                                    if ch == "FL" || ch == "MONO" {
                                        allowed_out_ports.insert(port_id);
                                        if !existing_links.contains(&(port_id, fl_id)) {
                                            let _ = Command::new("pw-link")
                                                .args([&port_id.to_string(), &fl_id.to_string()])
                                                .output()
                                                .await;
                                        }
                                    }
                                    if ch == "FR" || ch == "MONO" {
                                        allowed_out_ports.insert(port_id);
                                        if !existing_links.contains(&(port_id, fr_id)) {
                                            let _ = Command::new("pw-link")
                                                .args([&port_id.to_string(), &fr_id.to_string()])
                                                .output()
                                                .await;
                                        }
                                    }
                                }

                                // 4. Disconnect any unwanted auto-links into our capture ports
                                for &(out_id, in_id) in &existing_links {
                                    if cap_port_ids.contains(&in_id) && !allowed_out_ports.contains(&out_id) {
                                        let _ = Command::new("pw-link")
                                            .args(["-d", &out_id.to_string(), &in_id.to_string()])
                                            .output()
                                            .await;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        }
    });

    // pw-cat outputs 48kHz stereo s16 interleaved PCM
    let frame_samples = (SAMPLES_PER_CHANNEL * CHANNELS) as usize;
    let mut raw_buf = vec![0u8; frame_samples * 2];
    let mut i16_buf = vec![0i16; frame_samples];

    while !stop.load(Ordering::Relaxed) {
        if stdout.read_exact(&mut raw_buf).await.is_err() {
            break;
        }
        for i in 0..frame_samples {
            i16_buf[i] = i16::from_le_bytes([raw_buf[i * 2], raw_buf[i * 2 + 1]]);
        }
        let frame = AudioFrame {
            data: Cow::Borrowed(&i16_buf),
            sample_rate: SAMPLE_RATE,
            num_channels: CHANNELS,
            samples_per_channel: SAMPLES_PER_CHANNEL,
        };
        if source.capture_frame(&frame).await.is_err() {
            break;
        }
    }

    linker_task.abort();
    let _ = child.kill().await;
    Ok(())
}

/// Collects `root_pid` and all descendant PIDs from Linux `/proc` so every Electron
/// renderer/utility/audio subprocess of ZeroVC is excluded from system audio capture.
#[cfg(target_os = "linux")]
pub fn collect_process_tree(root_pid: u32) -> std::collections::HashSet<u32> {
    use std::collections::{HashMap, HashSet, VecDeque};

    let mut result = HashSet::new();
    if root_pid == 0 {
        return result;
    }

    let mut children_map: HashMap<u32, Vec<u32>> = HashMap::new();
    if let Ok(entries) = std::fs::read_dir("/proc") {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let pid: u32 = match name.to_string_lossy().parse() {
                Ok(p) => p,
                Err(_) => continue,
            };
            let stat_path = entry.path().join("stat");
            if let Ok(stat) = std::fs::read_to_string(stat_path) {
                // Format: pid (comm) state ppid ...
                if let Some(rparen) = stat.rfind(')') {
                    let rest = &stat[rparen + 1..];
                    let mut parts = rest.split_whitespace();
                    let _state = parts.next();
                    if let Some(ppid_str) = parts.next() {
                        if let Ok(ppid) = ppid_str.parse::<u32>() {
                            children_map.entry(ppid).or_default().push(pid);
                        }
                    }
                }
            }
        }
    }

    let mut queue = VecDeque::new();
    queue.push_back(root_pid);
    result.insert(root_pid);
    while let Some(pid) = queue.pop_front() {
        if let Some(kids) = children_map.get(&pid) {
            for &kid in kids {
                if result.insert(kid) {
                    queue.push_back(kid);
                }
            }
        }
    }
    result
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::collect_process_tree;

    #[test]
    fn process_tree_contains_self() {
        let pid = std::process::id();
        let tree = collect_process_tree(pid);
        assert!(tree.contains(&pid));
    }

    #[test]
    fn process_tree_zero_is_empty() {
        assert!(collect_process_tree(0).is_empty());
    }
}
