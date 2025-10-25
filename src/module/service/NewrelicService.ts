import { NewRelicMetricsResponse, NewRelicResult, ParsedNewRelicResult } from '../types/newrelic';

export class NewrelicService {
    private readonly flattenedAccountIds = '381491980507, 010526243585, 905418104963'; // test, demo, prod
    private readonly bffs = [
        'eor-people-hub-bff-test-api',
        'eor-people-hub-bff-demo-api',
        'eor-people-hub-bff-prod-api',
    ];
    private readonly daysAgo = 3;
    private readonly nrAccountId = '1747307';

    public async getMetrics(apiKey: string): Promise<NewRelicMetricsResponse> {
        try {
            console.log('Starting New Relic query...');

            const daterange = this.getDateRange(this.daysAgo);

            const query = `{
                actor {
                  account(id: ${this.nrAccountId}) {
                    nrql(
                      query: "SELECT 100 - (sum(\`aws.apigateway.5XXError\`) + sum(\`aws.apigateway.5xx\`)) * 100 / sum(\`aws.apigateway.Count\`) AS 'successPercentage', (sum(\`aws.apigateway.5XXError\`) + sum(\`aws.apigateway.5xx\`)) AS 'total5xx', sum(\`aws.apigateway.Count\`) AS 'totalRequests', average(\`aws.apigateway.Latency\`) AS 'latency',  average(\`aws.apigateway.IntegrationLatency\`) AS 'integrationLatency', count(\`aws.apigateway.Latency\`) AS \`latencyCount\`  FROM Metric WHERE aws.accountId IN (${this.flattenedAccountIds}) AND aws.apigateway.ApiName IS NOT NULL AND aws.apigateway.Method IS NOT NULL AND aws.apigateway.Resource IS NOT NULL AND aws.apigateway.Stage IS NOT NULL FACET aws.accountId as accountId, aws.apigateway.ApiName AS apiName, toDatetime(timestamp, 'yyyyMMdd') as date SINCE '${daterange.start}' UNTIL '${daterange.end}' LIMIT MAX",
                      timeout: 200
                    ) {
                      results
                    }
                  }
                }
              }`;

            const response = await fetch('https://api.newrelic.com/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'API-Key': apiKey,
                },
                body: JSON.stringify({
                    query,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                throw new Error(`New Relic API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            // Check for GraphQL errors
            if (data.errors) {
                console.error('GraphQL Errors:', data.errors);
                throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
            }

            const results = data.data?.actor?.account?.nrql?.results as NewRelicResult[];

            if (!results || results.length === 0) {
                console.log('No results found. This could mean:');
                throw new Error('No results found');
            }

            // Filter results for BFF APIs only based on facet array
            const bffResults = results.filter((result: NewRelicResult) => {
                // Check if any of the BFF API names are present in the facet array
                const hasBffApi = result.facet.some((facetValue) => this.bffs.includes(facetValue));
                return hasBffApi;
            });

            console.log('Total results:', results.length);
            console.log('BFF filtered results:', bffResults.length);
            console.log(
                'BFF APIs found:',
                bffResults.map((r: NewRelicResult) => r.facet.filter((facetValue) => this.bffs.includes(facetValue))),
            );

            console.log('bffResults:', bffResults);

            // Parse and aggregate the BFF results
            const parsedData = this.parseBffResults(bffResults);

            return {
                totalResults: bffResults.length,
                data: parsedData,
                queryTime: new Date().toISOString(),
            };
        } catch (error) {
            console.error('Error in getMetrics:', error);
            throw error;
        }
    }

    private parseBffResults(bffResults: NewRelicResult[]): { [key: string]: ParsedNewRelicResult } {
        console.log('Parsing BFF results...');

        // Group results by API name and environment
        const groupedData: { [key: string]: ParsedNewRelicResult } = {};

        bffResults.forEach((result: NewRelicResult) => {
            // Find account ID from facet array
            const accountId = result.facet[0];

            // Find the BFF API name from the facet array
            const apiName = result.facet[1];

            // Find the date from the facet array
            const date = result.facet[2];

            if (!apiName) {
                console.log('No BFF API found in facet:', result.facet);
                return; // Skip this result if no BFF API found
            }

            // Use the metrics directly from NewRelicResult
            const totalRequests = result.totalRequests;
            const total5xx = result.total5xx;
            const successPercentage = result.successPercentage;

            console.log('Processing result for', apiName, ':', {
                totalRequests,
                total5xx,
                successPercentage,
            });

            groupedData[apiName] = {
                accountId,
                totalRequests: totalRequests + (groupedData[apiName]?.totalRequests || 0),
                total5xx: total5xx + (groupedData[apiName]?.total5xx || 0),
                numberOfDays: (groupedData[apiName]?.numberOfDays || 0) + 1,
                queryDates: [...(groupedData[apiName]?.queryDates || []), date],
                totalSuccessPercentage: successPercentage + (groupedData[apiName]?.totalSuccessPercentage || 0),
            };
        });

        Object.values(groupedData).forEach((data: any) => {
            data.successPercentage = data.totalSuccessPercentage / data.numberOfDays; // average success percentage
        });

        return groupedData;
    }

    private getDateRange(daysAgo: number) {
        const now = new Date();

        // Compute UTC start and end dates
        const startUTC = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, 0, 0, 0),
        );

        const endUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

        // Helper to format Date as 'YYYY-MM-DD HH:mm:ss'
        const formatUTC = (date: Date) => {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return (
                `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
                `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
            );
        };

        return { start: formatUTC(startUTC), end: formatUTC(endUTC) };
    }
}
