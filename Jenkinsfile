pipeline {
    agent any

    environment {
        APP_NAME   = 'aws-infra-ai-assistant'
        APP_PORT   = '8000'
        OLLAMA_URL = 'http://host.docker.internal:11434/api/generate'
        OLLAMA_MODEL = 'llama3.2:1b'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        stage('Checkout Source') {
            steps {
                echo 'Checking out source code...'
                checkout scm
            }
        }

        stage('Setup Python Environment') {
            steps {
                echo 'Setting up Python environment...'

                sh '''
                    python3 -m venv venv
                    . venv/bin/activate

                    pip install --upgrade pip

                    if [ -f requirements.txt ]; then
                        pip install -r requirements.txt
                    fi

                    pip install flake8
                '''
            }
        }

        stage('Lint & Code Quality') {
            steps {
                echo 'Running Python lint checks...'

                sh '''
                    . venv/bin/activate

                    flake8 main.py \
                        --count \
                        --select=E9,F63,F7,F82 \
                        --show-source \
                        --statistics
                '''
            }
        }

        stage('Security Scan') {
            steps {
                echo 'Running security scan...'

                sh '''
                    . venv/bin/activate

                    pip install bandit

                    bandit -r main.py -ll || true
                '''
            }
        }

        stage('Application Import Test') {
            steps {
                echo 'Testing FastAPI application imports...'

                sh '''
                    . venv/bin/activate

                    python3 -c "
import main
print('FastAPI application imported successfully.')
"
                '''
            }
        }

        stage('Docker Build') {
            steps {
                echo 'Building Docker image...'

                sh '''
                    docker build \
                        -t ${APP_NAME}:latest \
                        -t ${APP_NAME}:${BUILD_NUMBER} \
                        .
                '''
            }
        }

        stage('Deploy Container') {
            steps {
                echo 'Deploying application container...'

                sh '''
                    docker stop ${APP_NAME} || true
                    docker rm ${APP_NAME} || true

                    docker run -d \
                        --name ${APP_NAME} \
                        --restart always \
                        --add-host=host.docker.internal:host-gateway \
                        -p ${APP_PORT}:8000 \
                        -e OLLAMA_URL="${OLLAMA_URL}" \
                        -e OLLAMA_MODEL="${OLLAMA_MODEL}" \
                        ${APP_NAME}:latest

                    echo "Application deployed on port ${APP_PORT}"
                '''
            }
        }

        stage('Post Deployment Check') {
            steps {
                echo 'Verifying deployed application...'

                sh '''
                    sleep 10

                    curl --fail \
                        --retry 5 \
                        --retry-delay 2 \
                        http://localhost:${APP_PORT}/metrics
                        || (
                            echo "Application health check failed"
                            docker logs ${APP_NAME}
                            exit 1
                        )

                    echo "Application is responding successfully."
                '''
            }
        }
    }

    post {

        always {
            echo 'Cleaning Jenkins workspace artifacts...'

            sh '''
                rm -rf venv __pycache__
            '''
        }

        success {
            echo 'Pipeline completed successfully. AWS Infra AI is deployed.'
        }

        failure {
            echo 'Pipeline failed. Check the failed stage and console logs.'
        }
    }
}