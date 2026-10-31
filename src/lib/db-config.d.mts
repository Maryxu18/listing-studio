export function connectionOptions(): {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: "require";
  prepare: false;
};
