use std::env;
use std::net::SocketAddr;

/// Server configuration loaded from environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    /// Address to bind the HTTP server.
    pub listen_addr: SocketAddr,
    /// PostgreSQL connection URL.
    pub database_url: String,
    /// S3-compatible endpoint URL (e.g., MinIO).
    #[allow(dead_code)]
    pub s3_endpoint: Option<String>,
    /// S3 bucket name for attachments.
    #[allow(dead_code)]
    pub s3_bucket: String,
    /// S3 region.
    #[allow(dead_code)]
    pub s3_region: String,
    /// S3 access key.
    #[allow(dead_code)]
    pub s3_access_key: Option<String>,
    /// S3 secret key.
    #[allow(dead_code)]
    pub s3_secret_key: Option<String>,
}

impl Config {
    /// Load configuration from environment variables.
    ///
    /// Required: `DATABASE_URL`
    /// Optional: `HOST`, `PORT`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`,
    ///           `S3_ACCESS_KEY`, `S3_SECRET_KEY`
    pub fn from_env() -> Result<Self, String> {
        let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port: u16 = env::var("PORT")
            .unwrap_or_else(|_| "3000".to_string())
            .parse()
            .map_err(|_| "PORT must be a valid u16")?;

        let listen_addr: SocketAddr = format!("{host}:{port}")
            .parse()
            .map_err(|e| format!("Invalid listen address: {e}"))?;

        let database_url = env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required")?;

        Ok(Config {
            listen_addr,
            database_url,
            s3_endpoint: env::var("S3_ENDPOINT").ok(),
            s3_bucket: env::var("S3_BUCKET").unwrap_or_else(|_| "dotrc-attachments".to_string()),
            s3_region: env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
            s3_access_key: env::var("S3_ACCESS_KEY").ok(),
            s3_secret_key: env::var("S3_SECRET_KEY").ok(),
        })
    }
}
