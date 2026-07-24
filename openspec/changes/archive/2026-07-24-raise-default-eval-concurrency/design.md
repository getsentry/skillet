# Design

Change the shared config default and engine fallback to four. The existing Vitest `maxConcurrency` boundary remains the only parallelism control: case files are serial, while tests inside one case may overlap up to the resolved value.

The regression test uses a shared barrier that requires four harness processes to be alive together. It fails under a smaller or serial default without depending on elapsed-time assertions.
