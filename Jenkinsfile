pipeline {
    agent any

    environment {
        APP_NAME           = 'aws-infra-ai'
        IMAGE_NAME         = 'aws-infra-ai'
        CONTAINER_NAME     = 'aws-infra-ai-prod'
        HOST_PORT          = '8000'
        AWS_DEFAULT_REGION = 'eu-north-1'
        OLLAMA_BASE_URL    = 'http://127.0.0.1:11434'
        OLLAMA_MODEL       = 'qwen2.5-coder:1.5b'
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
                sh 'python3 -m py_compile main.py'
            }
        }

        stage('Docker Build') {
            steps {
                sh '''
                    export DOCKER_BUILDKIT=1
                    docker build --network=host -t ${IMAGE_NAME}:${BUILD_NUMBER} -t ${IMAGE_NAME}:latest .
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
                        echo "Cleaning up existing container if present..."
                        docker rm -f ${CONTAINER_NAME} 2>/dev/null || true

                        echo "Starting application container in host network mode..."
                        docker run -d \
                            --name ${CONTAINER_NAME} \
                            --restart unless-stopped \
                            --network=host \
                            -e AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION} \
                            -e OLLAMA_BASE_URL="${OLLAMA_BASE_URL}" \
                            -e OLLAMA_MODEL="${OLLAMA_MODEL}" \
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
                    MAX_ATTEMPTS=20
                    HEALTH_URL="http://127.0.0.1:${HOST_PORT}/health"

                    until curl -s -f ${HEALTH_URL} > /dev/null; do
                        ATTEMPTS=$((ATTEMPTS+1))
                        if [ ${ATTEMPTS} -ge ${MAX_ATTEMPTS} ]; then
                            echo "Health check failed."
                            exit 1
                        fi
                        echo "Waiting for app to start (${ATTEMPTS}/${MAX_ATTEMPTS})..."
                        sleep 3
                    done

                    echo "Application is Healthy!"
                    curl -s ${HEALTH_URL}
                '''
            }
        }

        stage('Pre-Warm Model') {
            steps {
                sh '''
                    echo "Pre-warming Ollama model in RAM to prevent inference lag..."
                    curl -s http://127.0.0.1:11434/api/generate -d '{
                      "model": "'"${OLLAMA_MODEL}"'",
                      "keep_alive": -1
                    }' > /dev/null || true
                    echo "Model is ready."
                '''
            }
        }

        stage('Image Pruning') {
            steps {
                sh 'docker image prune -f --filter "until=72h" || true'
            }
        }
    }

    post {
        failure {
            echo "Deployment failed. Rolling back..."
            sh '''
                if [ -n "${PREV_IMAGE}" ]; then
                    docker rm -f ${CONTAINER_NAME} 2>/dev/null || true
                    docker run -d \
                        --name ${CONTAINER_NAME} \
                        --restart unless-stopped \
                        --network=host \
                        -e AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION} \
                        -e OLLAMA_BASE_URL="${OLLAMA_BASE_URL}" \
                        -e OLLAMA_MODEL="${OLLAMA_MODEL}" \
                        ${PREV_IMAGE}
                fi
            '''
        }
        success {
            echo "Deployment successful on host network."
        }
    }
}