FROM messense/cargo-xwin@sha256:9856b895265d4966f212228ba64802cf89337e2a2a537aa2533c1b8784cbc81b

ARG TAURI_CLI_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm nsis p7zip-full && rm -rf /var/lib/apt/lists/*
RUN npm install --prefix /opt/tauri --no-audit --no-fund "@tauri-apps/cli@${TAURI_CLI_VERSION}"
RUN rustup update stable --no-self-update && rustup default stable && rustup target add x86_64-pc-windows-msvc
