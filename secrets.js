// secrets.js
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');

async function accessSecret(secretName) {
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

// Export the function so it can be used in other files.  This is CRUCIAL.
module.exports = {
  getSecret: accessSecret, // You can name the exported function differently if you like
};