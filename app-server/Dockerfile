FROM python:3.13-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY . .
ENV OCTATE_DATA=/app/data
ENV PORT=8080
EXPOSE 8080
CMD ["python", "server.py"]
