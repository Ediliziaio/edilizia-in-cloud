import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
afterEach(()=>{cleanup();vi.useRealTimers();});
it("starts a fresh deadline for every loading cycle and never flashes an old timeout",()=>{
 vi.useFakeTimers();
 const hook=renderHook(({loading})=>useLoadingTimeout(loading,100),{initialProps:{loading:true}});
 expect(hook.result.current).toBe(false);
 act(()=>vi.advanceTimersByTime(100));expect(hook.result.current).toBe(true);
 hook.rerender({loading:false});expect(hook.result.current).toBe(false);
 hook.rerender({loading:true});expect(hook.result.current).toBe(false);
 act(()=>vi.advanceTimersByTime(99));expect(hook.result.current).toBe(false);
 act(()=>vi.advanceTimersByTime(1));expect(hook.result.current).toBe(true);
});
it("cancels stale timers on completion and on unmount",()=>{
 vi.useFakeTimers();
 const hook=renderHook(({loading})=>useLoadingTimeout(loading,100),{initialProps:{loading:true}});
 act(()=>vi.advanceTimersByTime(50));hook.rerender({loading:false});
 act(()=>vi.advanceTimersByTime(200));expect(hook.result.current).toBe(false);
 hook.rerender({loading:true});hook.unmount();expect(vi.getTimerCount()).toBe(0);
});
