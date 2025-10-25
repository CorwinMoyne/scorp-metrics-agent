import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { VertexAI } from '@google-cloud/vertexai';
import { NewrelicService } from '../../module/service/NewrelicService';

const newrelicService = new NewrelicService();
/**
 * Hello Agent Lambda function that demonstrates Vertex AI integration
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 */

export const lambdaHandler = async (
    _event: APIGatewayProxyEvent,
    context: Context,
): Promise<APIGatewayProxyResult | undefined> => {
    // 💡 THE FIX: Tell Lambda to exit as soon as the main promise resolves.
    context.callbackWaitsForEmptyEventLoop = false;

    // console.log('context:', context);

    // Suppress all deprecation warnings including punycode
    const originalEmit = process.emit;
    process.emit = function (name: string, data: any) {
        if (name === 'warning' && data && data.name === 'DeprecationWarning') {
            return false; // Suppress all deprecation warnings
        }
        return originalEmit.apply(this, arguments as any);
    };

    // Also suppress warnings at the process level
    process.removeAllListeners('warning');
    process.on('warning', (warning) => {
        if (warning.name === 'DeprecationWarning') {
            return; // Suppress all deprecation warnings
        }
        console.warn(warning);
    });

    const vertexAiSecretName = 'vertexai';
    const newrelicApiKeySecretName = 'newrelic-api-key';

    const secretsManagerClient = new SecretsManagerClient({
        region: 'eu-west-1',
    });

    let vertexAiSecretsResponse;
    let newrelicApiKeySecretsResponse;

    try {
        vertexAiSecretsResponse = await secretsManagerClient.send(
            new GetSecretValueCommand({
                SecretId: vertexAiSecretName,
            }),
        );
        newrelicApiKeySecretsResponse = await secretsManagerClient.send(
            new GetSecretValueCommand({
                SecretId: newrelicApiKeySecretName,
            }),
        );
    } catch (error) {
        console.error('Error in getting secrets:', error);
        throw error;
    }

    const secret = vertexAiSecretsResponse.SecretString;
    const credentials = JSON.parse(JSON.parse(secret || '{}')[vertexAiSecretName]);
    const newrelicApiKeySecret = newrelicApiKeySecretsResponse.SecretString;
    const newrelicApiKey = JSON.parse(newrelicApiKeySecret || '{}')[newrelicApiKeySecretName];

    console.log('New Relic API Key retrieved:', newrelicApiKey ? 'Present' : 'Missing');

    let newRelicResults = null;
    try {
        console.log('Calling New Relic service...');
        newRelicResults = await newrelicService.getMetrics(newrelicApiKey);
        console.log('New Relic query completed successfully');
    } catch (error) {
        console.error('Error in getting New Relic metrics:', error);
        // Continue execution even if New Relic fails
    }

    try {
        const textModel = 'gemini-2.5-flash';

        const vertexAI = new VertexAI({
            project: credentials.project_id,
            location: 'us-central1',
            googleAuthOptions: {
                credentials: {
                    client_email: credentials.client_email,
                    private_key: credentials.private_key,
                },
            },
        });

        const generativeModel = vertexAI.getGenerativeModel({
            model: textModel,
        });

        const prompt = 'Why is TypeScript better than JavaScript in a large project?';

        // const response = await generativeModel.generateContent({
        //     contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // });

        // const generatedText = response.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                message: 'Hello Agent is working!',
                newRelicResults,
                timestamp: new Date().toISOString(),
            }),
        };
    } catch (error) {
        console.error('Error in hello-agent:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                message: 'Error occurred in hello-agent',
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error instanceof Error ? error.name : 'Unknown',
                timestamp: new Date().toISOString(),
            }),
        };
    }
};
