FROM journeyapps/powersync-service:latest

COPY config /config

ENV POWERSYNC_CONFIG_PATH=/config/service.yaml
ENV NODE_OPTIONS=--max-old-space-size=1000

CMD ["start", "-r", "unified", "-c", "/config/service.yaml"]
