FROM gradle:8.4-jdk17-alpine AS build
WORKDIR /home/gradle/src
COPY --chown=gradle:gradle . .
RUN gradle shadowJar --no-daemon

FROM openjdk:17-jdk-slim
WORKDIR /app
RUN mkdir -p data
COPY --from=build /home/gradle/src/build/libs/FantasyFirstSlackBot-1.0-SNAPSHOT-all.jar /app/app.jar
CMD ["java", "-jar", "/app/app.jar"]