use thiserror::Error;

#[derive(Debug, Error)]
pub enum DotrcError {
  #[error("not implemented")]
  NotImplemented,
}
