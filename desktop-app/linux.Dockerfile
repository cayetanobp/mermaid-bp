FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev \
    librsvg2-dev libwebkit2gtk-4.1-dev libxdo-dev ca-certificates xz-utils \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y nodejs \
 && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal \
 && rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.cargo/bin:$PATH"
WORKDIR /workspace
ENTRYPOINT ["bash", "scripts/build-linux-deb-container.sh"]
