FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /usr/local/bin/laluan-entrypoint.sh
RUN chmod +x /usr/local/bin/laluan-entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html
# Writes /config.js from the container env (frontend.env via compose), then runs the nginx CMD.
ENTRYPOINT ["/usr/local/bin/laluan-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
EXPOSE 80
