const ftp = require("basic-ftp");

async function check() {
    const client = new ftp.Client();
    try {
        await client.access({
            host: "145.79.30.137",
            user: "u429894651.partygamehub.cc",
            password: "Blan1004!",
            port: 21
        });
        
        console.log("Listing /nodejs with metadata...");
        const list = await client.list("/nodejs");
        for (const item of list) {
            console.log(`${item.name} - ${item.size} bytes - Modified: ${item.modifiedAt}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        client.close();
    }
}

check();
