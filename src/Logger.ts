import { appendFileSync, existsSync, mkdirSync } from "fs";

export class Logger {
    private static logDirectory: string = "./logs";
    static log(...messages: string[]) {
        console.log(...messages);
        const now = new Date();
        // year date in yyyy-mm-dd format
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, "0");
        const day = now.getDate().toString().padStart(2, "0");
        const date = `${year}-${month}-${day}`;
        appendFileSync(
            `${this.logDirectory}/${date}.log`,
            `${new Date().toISOString()} - ${messages.join(" ")}\n`
        );
    }

    static setLogDirectory(directory: string) {
        this.logDirectory = directory;
        // create directory if it doesn't exist
        if (!existsSync(directory)) {
            mkdirSync(directory, { recursive: true });
        }
    }
}
