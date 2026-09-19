# Capacitor & Cordova ProGuard rules for safe shrinking and minification
-keepattributes *Annotation*
-keepattributes JavascriptInterface

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keep class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class * extends com.getcapacitor.Bridge { *; }
-keep class * extends com.getcapacitor.BridgeActivity { *; }
-keep class * extends com.getcapacitor.MessageHandler { *; }
-dontwarn com.getcapacitor.**

-keep class org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

