# Stage 1: Build the React application
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Create a minimal image that only contains the 'dist' folder
# We will use this to share the build with the master Nginx Citadel Gateway
FROM busybox
COPY --from=build /app/dist /dist
CMD ["sh", "-c", "cp -r /dist/* /shared_dist/ && tail -f /dev/null"]
