use serde::Serialize;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DetectedActivity {
    #[serde(rename = "type")]
    pub activity_type: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    pub start_time: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StreamerSoftwareStatus {
    pub running_apps: Vec<String>,
}

struct KnownGameEntry {
    processes: &'static [&'static str],
    name: &'static str,
    activity_type: &'static str,
}

const KNOWN_GAMES_AND_APPS: &[KnownGameEntry] = &[
    KnownGameEntry {
        processes: &[
            "minecraft.exe",
            "bedrock_server.exe",
            "minecraft.windows.exe",
            "javaw.exe",
        ],
        name: "Minecraft",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &[
            "leagueclient.exe",
            "leagueclientux.exe",
            "league of legends.exe",
        ],
        name: "League of Legends",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["valorant.exe", "valorant-win64-shipping.exe"],
        name: "VALORANT",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["tftclient.exe", "tftclient-win64-shipping.exe"],
        name: "Teamfight Tactics",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["cs2.exe", "csgo.exe"],
        name: "Counter-Strike 2",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["gta5.exe", "fivem.exe", "fivem_b2699_gtaprocess.exe"],
        name: "Grand Theft Auto V",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["robloxplayerbeta.exe", "roblox.exe"],
        name: "Roblox",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["fortniteclient-win64-shipping.exe", "fortnitelauncher.exe"],
        name: "Fortnite",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["overwatch.exe"],
        name: "Overwatch 2",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["genshinimpact.exe", "yuanshen.exe"],
        name: "Genshin Impact",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["starrail.exe"],
        name: "Honkai: Star Rail",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["r5apex.exe"],
        name: "Apex Legends",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["rocketleague.exe"],
        name: "Rocket League",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["cyberpunk2077.exe"],
        name: "Cyberpunk 2077",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["eldenring.exe"],
        name: "ELDEN RING",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["terraria.exe"],
        name: "Terraria",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["stardew valley.exe", "stardewvalley.exe"],
        name: "Stardew Valley",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["dota2.exe"],
        name: "Dota 2",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["deadbydaylight-win64-shipping.exe", "deadbydaylight.exe"],
        name: "Dead by Daylight",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["rustclient.exe"],
        name: "Rust",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["among us.exe"],
        name: "Among Us",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["osu!.exe", "osu.exe", "osu!lazer.exe"],
        name: "osu!",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["rainbowsix.exe", "rainbowsix_vulkan.exe"],
        name: "Rainbow Six Siege",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["worldoftanks.exe"],
        name: "World of Tanks",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["warframe.x64.exe", "warframe.exe"],
        name: "Warframe",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["destiny2.exe"],
        name: "Destiny 2",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["tslgame.exe"],
        name: "PUBG: BATTLEGROUNDS",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["fallguys_client.exe"],
        name: "Fall Guys",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["brawlhalla.exe"],
        name: "Brawlhalla",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["ts4_x64.exe", "thesims4.exe"],
        name: "The Sims 4",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["spotify.exe", "spotify"],
        name: "Spotify",
        activity_type: "listening",
    },
    KnownGameEntry {
        processes: &["blender.exe"],
        name: "Blender",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["photoshop.exe"],
        name: "Adobe Photoshop",
        activity_type: "playing",
    },
    KnownGameEntry {
        processes: &["code.exe"],
        name: "Visual Studio Code",
        activity_type: "playing",
    },
];

struct StreamerAppEntry {
    name: &'static str,
    processes: &'static [&'static str],
}

const DEFAULT_STREAMER_APPS: &[StreamerAppEntry] = &[
    StreamerAppEntry {
        name: "OBS Studio",
        processes: &["obs64.exe", "obs32.exe", "obs.exe", "obs"],
    },
    StreamerAppEntry {
        name: "Streamlabs Desktop",
        processes: &[
            "streamlabs desktop.exe",
            "streamlabs obs.exe",
            "streamlabs.exe",
            "slobs.exe",
        ],
    },
    StreamerAppEntry {
        name: "XSplit Broadcaster",
        processes: &["xsplit.core.exe", "xsplit.exe", "xsplit.broadcaster.exe"],
    },
    StreamerAppEntry {
        name: "Twitch Studio",
        processes: &["twitchstudio.exe", "twitch studio.exe"],
    },
    StreamerAppEntry {
        name: "vMix",
        processes: &["vmix64.exe", "vmix.exe"],
    },
];

pub struct ProcessMonitorState {
    pub custom_streamer_processes: Mutex<Vec<String>>,
    pub last_running_streamer_apps: Mutex<Vec<String>>,
    pub last_detected_activity: Mutex<Option<DetectedActivity>>,
    pub has_performed_initial_scan: Mutex<bool>,
}

impl Default for ProcessMonitorState {
    fn default() -> Self {
        Self {
            custom_streamer_processes: Mutex::new(Vec::new()),
            last_running_streamer_apps: Mutex::new(Vec::new()),
            last_detected_activity: Mutex::new(None),
            has_performed_initial_scan: Mutex::new(false),
        }
    }
}

pub fn collect_running_process_names() -> HashSet<String> {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.processes()
        .values()
        .map(|p| p.name().to_string_lossy().to_lowercase())
        .collect()
}

pub fn is_any_process_running(proc_set: &HashSet<String>, targets: &[String]) -> bool {
    targets
        .iter()
        .any(|t| proc_set.contains(&t.to_lowercase().trim().to_string()))
}

pub fn detect_streamer_apps(proc_set: &HashSet<String>, custom_procs: &[String]) -> Vec<String> {
    let mut detected = Vec::new();
    for app in DEFAULT_STREAMER_APPS {
        if app.processes.iter().any(|p| proc_set.contains(*p)) {
            detected.push(app.name.to_string());
        }
    }
    for custom in custom_procs {
        let norm = custom.to_lowercase().trim().to_string();
        if !norm.is_empty() && proc_set.contains(&norm) && !detected.contains(&norm) {
            detected.push(norm);
        }
    }
    detected
}

pub fn detect_activity(proc_set: &HashSet<String>, now_secs: u64) -> Option<DetectedActivity> {
    for item in KNOWN_GAMES_AND_APPS {
        if item.name == "OBS Studio" || item.name.to_lowercase().contains("obs") {
            continue;
        }
        if item.processes.iter().any(|p| proc_set.contains(*p)) {
            let icon_url = if item.name.to_lowercase().contains("minecraft") {
                Some("/assets/minecraft.webp".to_string())
            } else {
                None
            };
            return Some(DetectedActivity {
                activity_type: item.activity_type.to_string(),
                name: item.name.to_string(),
                details: None,
                start_time: now_secs,
                icon_url,
            });
        }
    }
    None
}

pub async fn scan_processes_once(app: &AppHandle, state: &Arc<ProcessMonitorState>) {
    let proc_set = tokio::task::spawn_blocking(collect_running_process_names)
        .await
        .unwrap_or_default();

    let custom_procs = state.custom_streamer_processes.lock().await.clone();
    let detected_streamers = detect_streamer_apps(&proc_set, &custom_procs);

    let initial_done = {
        let guard = state.has_performed_initial_scan.lock().await;
        *guard
    };

    {
        let mut last_streamers = state.last_running_streamer_apps.lock().await;
        if *last_streamers != detected_streamers || !initial_done {
            *last_streamers = detected_streamers.clone();
            let _ = app.emit(
                "streamer-software-status",
                StreamerSoftwareStatus {
                    running_apps: detected_streamers,
                },
            );
        }
    }

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let found = detect_activity(&proc_set, now_secs);
    let mut last_act = state.last_detected_activity.lock().await;
    match (&*last_act, &found) {
        (Some(prev), Some(curr)) if prev.name == curr.name => {
            // Keep existing start_time
        }
        (None, None) => {
            if !initial_done {
                let _ = app.emit("activity-detected", Option::<DetectedActivity>::None);
            }
        }
        (_, Some(curr)) => {
            *last_act = Some(curr.clone());
            let _ = app.emit("activity-detected", Some(curr.clone()));
        }
        (Some(_), None) => {
            *last_act = None;
            let _ = app.emit("activity-detected", Option::<DetectedActivity>::None);
        }
    }

    let mut init_guard = state.has_performed_initial_scan.lock().await;
    *init_guard = true;
}

pub fn start_background_monitor(app: AppHandle, state: Arc<ProcessMonitorState>) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        scan_processes_once(&app, &state).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            scan_processes_once(&app, &state).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_match_known_game_and_exclude_obs_from_activity() {
        let mut procs = HashSet::new();
        procs.insert("obs64.exe".to_string());
        assert_eq!(detect_activity(&procs, 1000), None);

        procs.insert("valorant.exe".to_string());
        let act = detect_activity(&procs, 1000).expect("should detect VALORANT");
        assert_eq!(act.name, "VALORANT");
        assert_eq!(act.activity_type, "playing");
        assert_eq!(act.start_time, 1000);
    }

    #[test]
    fn test_detect_streamer_software_default_and_custom() {
        let mut procs = HashSet::new();
        procs.insert("obs64.exe".to_string());
        procs.insert("mycustomrecorder.exe".to_string());

        let custom = vec!["MyCustomRecorder.exe".to_string()];
        let apps = detect_streamer_apps(&procs, &custom);
        assert_eq!(apps, vec!["OBS Studio", "mycustomrecorder.exe"]);
    }

    #[test]
    fn test_process_name_matching_case_insensitive() {
        let mut procs = HashSet::new();
        procs.insert("spotify.exe".to_string());
        assert!(is_any_process_running(
            &procs,
            &["  Spotify.EXE ".to_string()]
        ));
        assert!(!is_any_process_running(&procs, &["discord.exe".to_string()]));
    }
}
