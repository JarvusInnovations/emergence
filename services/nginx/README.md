# emergence/nginx

This is a customized build of nginx, specialized for hosting emergence sites.

It is kept as close as possible to core/nginx so that improvements there can be
continuously merged in.

## Departures from core/nginx

- Origin is explicitly set to `emergence`
- `worker_processes` config default changed to `"auto"`
- `worker_rlimit_nofile` config added and defaulted to `8192`
- `http.access_log` config added and defaulted to none
- Removes `redirector` config
- Adds optional `app` bind
- Adds default static site to display when no app is bound
