# Matou App - Deployment Guide

Build and release the Matou desktop app for Linux, macOS, and Windows.

## Prerequisites

- **Go** 1.21+ (backend compilation)
- **Node.js** 18/20/22/24 with npm
- **Quasar CLI**: `npm install -g @quasar/cli`
- **glab** (optional, for CLI-based releases): `https://gitlab.com/gitlab-org/cli`

## Quick Build (Current Platform)

```bash
# 1. Build backend binary for your platform
cd backend
make build-linux-amd64    # or build-darwin-arm64, build-darwin-amd64, build-windows-amd64

# 2. Create .env.production
cd ../frontend
cp .env.production.example .env.production
# Edit with your config server URL

# 3. Build the Electron app
npm install
npx quasar build -m electron
```

Output: `frontend/dist/electron/Packaged/`

## Step-by-Step Build

### 1. Build Backend Binaries

The Go backend must be cross-compiled for each target platform before packaging.

```bash
cd backend

# Individual platform builds
make build-linux-amd64        # → bin/linux-amd64/matou-backend
make build-darwin-arm64       # → bin/darwin-arm64/matou-backend     (macOS Apple Silicon)
make build-darwin-amd64       # → bin/darwin-amd64/matou-backend     (macOS Intel)
make build-windows-amd64      # → bin/windows-amd64/matou-backend.exe

# Or build all at once
make build-all
```

The Electron build copies everything from `backend/bin/` into the app's resources directory. Only the binary matching the target platform is used at runtime.

### 2. Configure Production Environment

Create `frontend/.env.production` with your deployment settings:

```env
VITE_ENV=prod
VITE_PROD_CONFIG_URL=http://awa.matou.nz:3904
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_ENV` | Yes | Must be `prod` for production builds |
| `VITE_PROD_CONFIG_URL` | Yes | Config server URL (provides KERI URLs, witness OOBIs, any-sync config) |
| `VITE_SMTP_HOST` | No | SMTP server for email invites |
| `VITE_SMTP_PORT` | No | SMTP port for email invites |

These values are injected at **build time** into the Electron main process via esbuild `define` in `quasar.config.ts`. They cannot be changed after packaging.

### 3. Build the Electron App

```bash
cd frontend
npm install
npx quasar build -m electron
```

This produces platform-specific packages in `frontend/dist/electron/Packaged/`.

## Platform Details

### Linux (AppImage)

**Output**: `matou-{version}.AppImage`

**Sandbox workaround**: AppImages run via FUSE mounts where SUID sandbox binaries don't work. The `build/afterPack.cjs` hook automatically creates a wrapper script that launches the app with `--no-sandbox`. This is the same approach used by VS Code, Brave, and other Electron apps distributed as AppImages.

**Desktop integration**: On first launch, the app installs:
- Icons to `~/.local/share/icons/hicolor/{size}x{size}/apps/matou.png`
- A `.desktop` file to `~/.local/share/applications/matou.desktop`

**Data directory**: `~/.config/Matou/matou-data`

**Run**:
```bash
chmod +x matou-*.AppImage
./matou-*.AppImage
```

### macOS (zip)

**Output**: `matou-{version}.zip`

Unzip to get the `.app` bundle. The app is currently **unsigned** — users will need to right-click and select "Open" on first launch, or remove the quarantine attribute:

```bash
xattr -cr Matou.app
```

**Data directory**: `~/Library/Application Support/Matou/matou-data`

**Supported architectures**:
- Apple Silicon (M1/M2/M3/M4): requires `build-darwin-arm64`
- Intel: requires `build-darwin-amd64`

### Windows (NSIS installer)

**Output**: `matou-{version}.exe`

Standard NSIS installer. The app is currently **unsigned** — Windows SmartScreen may show a warning on first run.

**Data directory**: `%APPDATA%/Matou/matou-data`

## Creating a Release

### Update the Version

Update the version in `frontend/package.json` before building:

```json
{
  "version": "0.1.0"
}
```

The version is used in output filenames (e.g. `matou-0.1.0.AppImage`).

### Build All Platforms

```bash
# Build all backend binaries
cd backend && make build-all

# Build the Electron packages
cd ../frontend && npm install && npx quasar build -m electron
```

**Note**: Electron packages are built for the **current OS and architecture** by default. To build for other platforms, you need to run the build on each target OS (or use CI).

### Tag the Release

```bash
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

### Upload via glab (CLI)

Create a release and upload assets with the `glab` CLI:

```bash
# Create release with all platform artifacts
glab release create v0.1.0 \
  --title "Matou v0.1.0" \
  --notes "Release notes here" \
  frontend/dist/electron/Packaged/matou-0.1.0.AppImage \
  frontend/dist/electron/Packaged/matou-0.1.0.zip \
  frontend/dist/electron/Packaged/matou-0.1.0.exe
```

Upload only the artifacts you've built. For example, if you only built for Linux:

```bash
glab release create v0.1.0 \
  --title "Matou v0.1.0" \
  --notes "Release notes here" \
  frontend/dist/electron/Packaged/matou-0.1.0.AppImage
```

To add assets to an existing release:

```bash
glab release upload v0.1.0 \
  frontend/dist/electron/Packaged/matou-0.1.0.zip
```

### Upload via GitLab Web UI

1. Go to https://gitlab.com/matou-collective/matou-app/-/releases
2. Click **New release**
3. Choose the tag (e.g. `v0.1.0`) or create a new one
4. Add a title and release notes
5. Under **Release assets**, click **Add another link** for each artifact:
   - **Link title**: `Matou for Linux (AppImage)`, `Matou for macOS (zip)`, or `Matou for Windows (exe)`
   - **URL**: Upload the file first via **Uploads** (drag-and-drop in the description editor to get a URL), then paste the URL
   - **Type**: Select **Package**
6. Click **Create release**

Alternatively, upload files as **Generic Packages** first, then link them:

1. Upload each artifact as a generic package:
   ```bash
   # Upload to GitLab's generic package registry
   curl --header "PRIVATE-TOKEN: <your-token>" \
     --upload-file frontend/dist/electron/Packaged/matou-0.1.0.AppImage \
     "https://gitlab.com/api/v4/projects/matou-collective%2Fmatou-app/packages/generic/matou/0.1.0/matou-0.1.0.AppImage"
   ```
2. Then reference the package URLs in the release asset links

## How It Works

### Backend Lifecycle

The Electron main process spawns the Go backend as a child process:

1. Finds a free port dynamically
2. Locates the backend binary at `resources/backend/{platform}-{arch}/matou-backend`
3. Spawns it with environment variables (`MATOU_SERVER_PORT`, `MATOU_DATA_DIR`, etc.)
4. Polls `/health` until the backend is ready (up to 30 seconds)
5. Opens the app window pointing to `http://127.0.0.1:{port}`
6. Kills the backend on app exit

### Config Server

In production mode, the backend fetches its any-sync network configuration from the config server URL (`MATOU_CONFIG_SERVER_URL`). The config is cached locally at `config/client-production.yml` after the first fetch.

The config server provides:
- any-sync network configuration (coordinator, file nodes, tree nodes)
- KERI witness OOBIs
- Organization endpoints

### Directory Structure After Build

```
frontend/dist/electron/Packaged/
├── linux-unpacked/              # Unpacked Linux app
│   ├── matou                    # Shell wrapper (--no-sandbox)
│   ├── matou.bin                # Real Electron binary
│   └── resources/
│       ├── app.asar             # Bundled frontend + electron main
│       ├── backend/
│       │   └── linux-amd64/
│       │       └── matou-backend
│       └── icons/               # App icons
├── matou-{version}.AppImage     # Linux
├── matou-{version}.zip          # macOS
└── matou-{version}.exe          # Windows
```

## Troubleshooting

### Backend binary not found (ENOENT)

```
Error: spawn .../resources/backend/linux-amd64/matou-backend ENOENT
```

The backend wasn't compiled before the Electron build. Run the appropriate `make build-{platform}` target first.

### Config server connection failed

```
Failed to fetch any-sync config from config server
```

Check that `VITE_PROD_CONFIG_URL` in `.env.production` is correct and the config server is reachable. Use `http://` not `https://` if the server doesn't have TLS.

### TLS handshake error

```
tls: first record does not look like a TLS handshake
```

The URL uses `https://` but the server is running plain HTTP. Change to `http://` in `.env.production` and rebuild.

### App exits silently (no window)

If the backend fails to start, the app may exit without showing an error dialog. Run from a terminal to see backend logs:

```bash
./matou-*.AppImage          # Linux
open Matou.app --args       # macOS (view logs in Console.app)
```

### Linux sandbox errors

```
The SUID sandbox helper binary was found, but is not configured correctly
```

The `afterPack.cjs` hook should handle this automatically. If it didn't run, check that `build/afterPack.cjs` exists and is referenced in `quasar.config.ts` under `builder.afterPack`.
