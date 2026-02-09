import { describe, it, expect } from "vitest";
import { formatBytes, linkTypeLabel, linkTypeColor } from "./utils";

describe("formatBytes", () => {
  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
  });
});

describe("linkTypeLabel", () => {
  it("returns label for known types", () => {
    expect(linkTypeLabel("followup")).toBe("Follow-up");
    expect(linkTypeLabel("corrects")).toBe("Corrects");
    expect(linkTypeLabel("supersedes")).toBe("Supersedes");
    expect(linkTypeLabel("related")).toBe("Related");
  });

  it("returns raw type for unknown types", () => {
    expect(linkTypeLabel("custom")).toBe("custom");
  });
});

describe("linkTypeColor", () => {
  it("returns class string for known types", () => {
    expect(linkTypeColor("followup")).toContain("bg-blue");
    expect(linkTypeColor("corrects")).toContain("bg-amber");
    expect(linkTypeColor("supersedes")).toContain("bg-red");
    expect(linkTypeColor("related")).toContain("bg-neutral");
  });

  it("returns default for unknown types", () => {
    expect(linkTypeColor("unknown")).toContain("bg-neutral");
  });
});
