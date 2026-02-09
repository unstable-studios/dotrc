import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("shows current page number", () => {
    render(
      <Pagination
        offset={0}
        limit={20}
        hasMore={true}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText("Page 1")).toBeInTheDocument();
  });

  it("disables previous on first page", () => {
    render(
      <Pagination
        offset={0}
        limit={20}
        hasMore={true}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText("Previous")).toBeDisabled();
    expect(screen.getByText("Next")).not.toBeDisabled();
  });

  it("disables next when no more pages", () => {
    render(
      <Pagination
        offset={20}
        limit={20}
        hasMore={false}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText("Previous")).not.toBeDisabled();
    expect(screen.getByText("Next")).toBeDisabled();
  });

  it("calls onPrev and onNext", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <Pagination
        offset={20}
        limit={20}
        hasMore={true}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );
    fireEvent.click(screen.getByText("Previous"));
    expect(onPrev).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Next"));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
