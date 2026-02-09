mod config;
mod error;
mod routes;
mod storage;

use std::sync::Arc;

use axum::routing::{get, post};
use axum::Router;
use sqlx::postgres::PgPoolOptions;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use routes::AppState;
use storage::PgStorage;

#[tokio::main]
async fn main() {
    // Initialize structured logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .json()
        .init();

    let config = config::Config::from_env().unwrap_or_else(|e| {
        eprintln!("Configuration error: {e}");
        std::process::exit(1);
    });

    tracing::info!(
        listen_addr = %config.listen_addr,
        "Starting dotrc-server"
    );

    // Connect to Postgres
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await
        .unwrap_or_else(|e| {
            eprintln!("Failed to connect to database: {e}");
            std::process::exit(1);
        });

    tracing::info!("Connected to PostgreSQL");

    let state = Arc::new(AppState {
        storage: PgStorage::new(pool),
    });

    let app = Router::new()
        .route("/", get(routes::health))
        .route("/dots", post(routes::create_dot).get(routes::list_dots))
        .route("/dots/{dotId}", get(routes::get_dot))
        .route(
            "/dots/{dotId}/grants",
            post(routes::grant_access).get(routes::get_grants),
        )
        .route(
            "/dots/{dotId}/links",
            post(routes::create_link).get(routes::get_links),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = TcpListener::bind(config.listen_addr)
        .await
        .unwrap_or_else(|e| {
            eprintln!("Failed to bind to {}: {e}", config.listen_addr);
            std::process::exit(1);
        });

    tracing::info!(
        addr = %config.listen_addr,
        "Server listening"
    );

    // Graceful shutdown on SIGTERM/SIGINT
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap_or_else(|e| {
            eprintln!("Server error: {e}");
            std::process::exit(1);
        });

    tracing::info!("Server stopped");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("Received Ctrl+C"),
        _ = terminate => tracing::info!("Received SIGTERM"),
    }
}
