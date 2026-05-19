import type { ScanReport, ConfigSource } from "./types.js";
export declare function runScan(sources: ConfigSource[], options?: {
    testTools?: boolean;
    timeoutMs?: number;
}): Promise<ScanReport>;
