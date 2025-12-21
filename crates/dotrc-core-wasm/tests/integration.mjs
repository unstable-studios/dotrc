// Simple integration test for WASM bindings

import { fileURLToPath } from "url";
import { dirname } from "path";

// Import functions directly from the bundler target
// The bundler target automatically initializes the WASM module
import { core_version, wasm_create_dot } from "../pkg/dotrc_core_wasm.js";

// Get the directory of this test file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test basic functionality (WASM is already initialized by the bundler target)
console.log("Core version:", core_version());

// Test create_dot
const draft = {
  title: "Test Dot",
  body: "Test body content",
  created_by: "user-1", // String, not object
  tenant_id: "tenant-1", // String, not object
  scope_id: "scope-1", // String, not object
  tags: ["test", "demo"],
  visible_to_users: ["user-1"], // Array of strings
  visible_to_scopes: ["scope-1"], // Array of strings
  attachments: [],
};

const result = wasm_create_dot(
  JSON.stringify(draft),
  "2025-12-20T12:00:00Z",
  "dot-123"
);

const parsed = JSON.parse(result);
console.log("Result type:", parsed.type);

if (parsed.type === "ok") {
  console.log("✓ Created dot:", parsed.data.dot.id);
  console.log("✓ Grants created:", parsed.data.grants.length);
  console.log("\nTest passed!");
} else {
  console.error("✗ Error:", parsed.kind, "-", parsed.message);
  process.exit(1);
}
