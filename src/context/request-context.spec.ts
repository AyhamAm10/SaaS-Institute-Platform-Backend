import { RequestContext } from './request-context';

describe('RequestContext Concurrency & Isolation', () => {
  it('guarantees complete isolation between concurrent async contexts', async () => {
    const runConcurrentTask = (id: number, delayMs: number) => {
      return RequestContext.run(
        { userId: id, instituteId: id * 10, role: `ROLE_${id}`, language: 'en' },
        async () => {
          // Verify initial context
          expect(RequestContext.getInstituteId()).toBe(id * 10);
          expect(RequestContext.getUserId()).toBe(id);

          // Simulate asynchronous I/O (e.g. database query, HTTP call)
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          // Verify that during concurrent execution, the context was NOT overwritten by other requests
          expect(RequestContext.getInstituteId()).toBe(id * 10);
          expect(RequestContext.getUserId()).toBe(id);
          expect(RequestContext.getRole()).toBe(`ROLE_${id}`);
          return RequestContext.getInstituteId();
        },
      );
    };

    // Run 20 concurrent requests with varying delays to interleave execution
    const promises = Array.from({ length: 20 }, (_, i) =>
      runConcurrentTask(i + 1, (20 - i) * 5),
    );

    const results = await Promise.all(promises);
    results.forEach((instId, index) => {
      expect(instId).toBe((index + 1) * 10);
    });
  });

  it('throws error when institute context is accessed outside authenticated context', () => {
    expect(() => RequestContext.getInstituteId()).toThrow(
      'RequestContext is not available',
    );
  });
});
