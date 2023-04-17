#!/bin/sh
cd /root
curl -o main.zip https://codeload.github.com/miki2999/teslabox/zip/refs/heads/main
unzip -o main.zip
cp -r teslabox-main/* teslabox
rm -rf teslabox-main
rm main.zip
cd teslabox
npm install --production
npm prune
systemctl restart teslabox
