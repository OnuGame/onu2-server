export interface Config {
    port: number;
    proxy: Proxy;
    logs: Logs;
}

export interface Logs {
    directory: string;
    client: {
        allow: boolean;
    };
}

export interface Proxy {
    enabled: boolean;
    url: string;
}
