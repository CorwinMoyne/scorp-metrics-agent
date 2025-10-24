import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { VertexAI } from '@google-cloud/vertexai';

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

    const secretName = 'vertexai';

    const client = new SecretsManagerClient({
        region: 'eu-west-1',
    });

    let secretResponse;

    try {
        secretResponse = await client.send(
            new GetSecretValueCommand({
                SecretId: secretName,
                VersionStage: 'AWSCURRENT', // VersionStage defaults to AWSCURRENT if unspecified
            }),
        );
    } catch (error) {
        console.error('here - Error in getting secret:', error);
        throw error;
    }

    const secret = secretResponse.SecretString;
    const credentials = JSON.parse(JSON.parse(secret || '{}')[secretName]);

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

        const response = await generativeModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const generatedText = response.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                message: generatedText,
            }),
        };
    } catch (error) {
        console.error('here - Error in hello-agent:', error);
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
