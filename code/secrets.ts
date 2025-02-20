// secrets.js
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");

export async function accessSecret(secretName: string) {
  const client = new SecretManagerServiceClient();
  const name = `projects/${process.env.GCP_PROJECT_ID}/secrets/${secretName}/versions/latest`;

  try {
    const [version] = await client.accessSecretVersion({ name });
    const payload = version.payload.data.toString();
    // console.log(`Secret ${secretName} value: ${payload.slice(0,10)}...`); // Log first 10 characters for debugging.
    return payload;
  } catch (error) {
    console.error(`Error accessing secret ${secretName}: ${error}`);
    throw error; // Re-throw for handling in the calling module
  }
}
