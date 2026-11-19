FROM node:24-bookworm-slim

ARG GENIEACS_VERSION=1.2.16

RUN npm install --global "genieacs@${GENIEACS_VERSION}" \
  && npm cache clean --force \
  && mkdir -p /opt/genieacs/ext \
  && chown -R node:node /opt/genieacs

ENV GENIEACS_EXT_DIR=/opt/genieacs/ext
ENV NODE_ENV=production

USER node
WORKDIR /opt/genieacs

CMD ["genieacs-cwmp"]
