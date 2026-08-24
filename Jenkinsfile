pipeline {
    agent any

    environment {
        APP_NAME           = 'aws-infra-ai'
        IMAGE_NAME         = 'aws-infra-ai'
        CONTAINER_NAME     = 'aws-infra-ai-prod'
        HOST_PORT          = '8000'
        CONTAINER_PORT     = '8000'
        AWS_DEFAULT_REGION = 'eu-north-1'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                sh 'git log -1 --oneline'
            }
        }

        stage('Validate Syntax') {
            steps {
                sh '''
                    python3 -m py_compile main.py
                '''
            }
        }

        stage('Docker Build') {
            steps {
                sh '''
                    docker build -t ${IMAGE_NAME}:${BUILD_NUMBER} -t ${IMAGE_NAME}:latest .
                '''
            }
        }

        stage('Safe Deploy') {
            steps {
                script {
                    env.PREV_IMAGE = sh(
                        script: "docker inspect --format='{{.Image}}' ${CONTAINER_NAME} 2>/dev/null || echo ''",
                        returnStdout: true
                    ).trim()

                    sh '''
                        if [ $(docker ps -aq -f name=^/${CONTAINER_NAME}$) ]; then
                            echo "Stopping existing container: ${CONTAINER_NAME}"
                            docker stop ${CONTAINER_NAME} || true
                            docker rm -f ${CONTAINER_NAME} || true
                        fi

                        docker run -d \
                            --name ${CONTAINER_NAME} \
                            --restart unless-stopped \
                            -p ${HOST_PORT}:${CONTAINER_PORT} \
                            -e AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION} \
                            ${IMAGE_NAME}:${BUILD_NUMBER}
                    '''
                }
            }
        }

        stage('Health Probe') {
            steps {
                sh '''
                    echo "Checking container health status..."
                    ATTEMPTS=0
                    MAX_ATTEMPTS=15
                    HEALTH_URL="http://localhost:${HOST_PORT}/health"

                    until curl -s -f ${HEALTH_URL} > /dev/null; do
                        ATTEMPTS=$((ATTEMPTS+1))
                        if [ ${ATTEMPTS} -ge ${MAX_ATTEMPTS} ]; then
                            echo "Health check failed after ${MAX_ATTEMPTS} attempts."
                            exit 1
                        fi
                        echo "Waiting for app to start (${ATTEMPTS}/${MAX_ATTEMPTS})..."
                        sleep 2
                    done

                    echo "Application is Healthy!"
                    curl -s ${HEALTH_URL}
                '''
            }
        }

        stage('Image Pruning') {
            steps {
                sh '''
                    docker image prune -f --filter "until=72h" || true
                '''
            }
        }
    }

    post {
        failure {
            echo "Deployment failed. Rolling back to previous working container..."
            sh '''
                if [ -n "${PREV_IMAGE}" ]; then
                    echo "Rolling back to: ${PREV_IMAGE}"
                    docker stop ${CONTAINER_NAME} || true
                    docker rm -f ${CONTAINER_NAME} || true
                    docker run -d \
                        --name ${CONTAINER_NAME} \
                        --restart unless-stopped \
                        -p ${HOST_PORT}:${CONTAINER_PORT} \
                        -e AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION} \
                        ${PREV_IMAGE}
                    echo "Rollback completed successfully."
                else
                    echo "No previous image found for rollback."
                fi
            '''
        }
        success {
            echo "Pipeline succeeded! AWS Infra AI is live on port ${HOST_PORT}."
        }
    }
}