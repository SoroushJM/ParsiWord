import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}
// An opt-in test build can coexist with an installation signed by a different
// distribution key. Keep namespace/JNI classes tied to the original package.
val parsiwordPreview = providers.gradleProperty("parsiwordPreview").orNull == "true"

android {
    compileSdk = 36
    namespace = "app.parsiword.mobile"
    defaultConfig {
        manifestPlaceholders["appLabel"] = if (parsiwordPreview) "ParsiWord Preview" else "@string/app_name"
        manifestPlaceholders["activityLabel"] = if (parsiwordPreview) "ParsiWord Preview" else "@string/main_activity_title"
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "app.parsiword.mobile"
        minSdk = 24
        targetSdk = 36
        // Android distribution is ARM64-only, including universal APK tasks.
        // Do not package stale emulator libraries left by previous builds.
        ndk {
            abiFilters += "arm64-v8a"
        }
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    packaging {
        jniLibs {
            // Extract the compressed native library during installation.
            // Avoid direct loading from an uncompressed APK entry.
            useLegacyPackaging = true
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            // Keep native symbols in Cargo's target directory, not in the preview APK.
            isJniDebuggable = false
            isMinifyEnabled = false
        }
        getByName("release") {
            if (parsiwordPreview) {
                applicationIdSuffix = ".preview"
                versionNameSuffix = "-preview"
            }
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
