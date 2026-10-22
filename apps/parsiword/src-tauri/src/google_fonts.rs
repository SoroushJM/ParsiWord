use std::time::Duration;

// No user documents or API keys are sent. These are the only remote resources
// this command can read; redirect following is deliberately disabled.
#[tauri::command]
pub async fn google_font_request(url: String) -> Result<tauri::ipc::Response, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "FONT_NETWORK")?;
    let allowed = parsed.scheme() == "https" && parsed.port_or_known_default() == Some(443)
        && parsed.username().is_empty() && parsed.password().is_none()
        && match parsed.host_str() {
            Some("fonts.googleapis.com") => parsed.path() == "/css" || parsed.path() == "/css2",
            Some("fonts.gstatic.com") => parsed.path().starts_with("/s/"),
            Some("fonts.google.com") => parsed.path() == "/metadata/fonts",
            _ => false,
        };
    if !allowed { return Err("FONT_NETWORK".into()); }
    let client = reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("ParsiWord/0.2 (font download; TrueType)")
        .timeout(Duration::from_secs(60))
        .build().map_err(|_| "FONT_NETWORK")?;
    let mut response = client.get(parsed).send().await.map_err(|_| "FONT_NETWORK")?
        .error_for_status().map_err(|_| "FONT_NETWORK")?;
    let maximum = 32 * 1024 * 1024;
    if response.content_length().is_some_and(|len| len > maximum as u64) { return Err("FONT_TOO_LARGE".into()); }
    let mut data = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "FONT_NETWORK")? {
        if data.len() + chunk.len() > maximum { return Err("FONT_TOO_LARGE".into()); }
        data.extend_from_slice(&chunk);
    }
    Ok(tauri::ipc::Response::new(data))
}
