FROM python:3.13-alpine
WORKDIR /app
COPY model-server ./model-server
EXPOSE 8090
CMD ["python", "model-server/server.py"]
