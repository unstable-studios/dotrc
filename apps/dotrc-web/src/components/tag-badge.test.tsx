import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TagBadge } from "./tag-badge";

describe("TagBadge", () => {
  it("renders the tag text", () => {
    render(<TagBadge tag="important" />);
    expect(screen.getByText("important")).toBeInTheDocument();
  });
});
