const ftp = require("basic-ftp");

async function test() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        console.log("Testing connection with partygamehub.cc username...");
        await client.access({
            host: "145.79.30.137",
            user: "u429894651.partygamehub.cc",
            password: "Blan1004!",
            port: 21,
            secure: false
        });
        console.log("SUCCESS! The new username is correct.");
    } catch (err) {
        console.error("FAILED to connect with new username:", err);
    } finally {
        client.close();
    }
}

test();
