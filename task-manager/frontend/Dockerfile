FROM nginx:alpine

# Remove default nginx static files and copy ours in
RUN rm -rf /usr/share/nginx/html/*
COPY index.html style.css app.js /usr/share/nginx/html/

EXPOSE 80
