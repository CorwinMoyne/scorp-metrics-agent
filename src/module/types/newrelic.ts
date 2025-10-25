export interface NewRelicResult {
    facet: string[];
    integrationLatency: number;
    latency: number;
    latencyCount: number;
    successPercentage: number;
    total5xx: number;
    totalRequests: number;
}

export interface ParsedNewRelicResult {
    accountId: string;
    totalRequests: number;
    total5xx: number;
    numberOfDays: number;
    queryDates: string[];
    totalSuccessPercentage: number;
    successPercentage?: number;
}

export interface NewRelicMetricsResponse {
    totalResults: number;
    data: { [key: string]: ParsedNewRelicResult };
    queryTime: string;
}
