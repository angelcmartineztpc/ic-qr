import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runViewTransition } from "./ViewTransition";

describe("runViewTransition", () => {
  const originalDocument = global.document;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls update callback immediately if document is hidden", () => {
    const update = vi.fn();
    const startViewTransition = vi.fn();

    // Mock document con visibilityState "hidden"
    const mockDoc = {
      ...originalDocument,
      visibilityState: "hidden",
      startViewTransition,
    };
    // @ts-expect-error test mock
    global.document = mockDoc;

    runViewTransition(update);

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);

    global.document = originalDocument;
  });

  it("catches rejected promises from aborted transitions", () => {
    const update = vi.fn();
    const finishedPromise = Promise.reject(new Error("Document hidden"));
    const readyPromise = Promise.reject(new Error("Document hidden"));

    // Prevenir unhandled rejection warning en tests
    finishedPromise.catch(() => {});
    readyPromise.catch(() => {});

    const startViewTransition = vi.fn().mockReturnValue({
      finished: finishedPromise,
      ready: readyPromise,
    });

    const mockDoc = {
      ...originalDocument,
      visibilityState: "visible",
      startViewTransition,
    };
    // @ts-expect-error test mock
    global.document = mockDoc;

    expect(() => runViewTransition(update)).not.toThrow();
    expect(startViewTransition).toHaveBeenCalledTimes(1);

    global.document = originalDocument;
  });
});

