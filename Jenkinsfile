pipeline {
    agent any

    environment {
        IMAGE_NAME = 'aws-infra-ai'
        CONTAINER_NAME = 'aws-infra-ai'
        APP_PORT = '8000'
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Checking out latest source code...'
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                echo 'Building Docker image...'

                sh '''
                    docker build -t ${IMAGE_NAME}:latest .
                '''
            }
        }

        stage('Test Docker Image') {
            steps {
                echo 'Testing Docker image...'

                sh '''
                    docker run --rm \
                    ${IMAGE_NAME}:latest \
                    python -c "import main; print('Application imported successfully!')"
                '''
            }
        }

        stage('Stop Old Container') {
            steps {
                echo 'Stopping existing application container...'

                sh '''
                    docker stop ${CONTAINER_NAME} || true
                    docker rm ${CONTAINER_NAME} || true
                '''
            }
        }

        stage('Deploy Container') {
            steps {
                echo 'Deploying application container...'

                sh '''
                    docker run -d \
                    --name ${CONTAINER_NAME} \
                    -p ${APP_PORT}:8000 \
                    ${IMAGE_NAME}:latest
                '''
            }
        }

        stage('Verify Deployment') {
            steps {
                echo 'Verifying application...'

                sh '''
                    sleep 5

                    curl -f http://localhost:${APP_PORT}/ || exit 1

                    echo "Application is running successfully!"
                '''
            }
        }
    }

    post {
        success {
            echo '======================================'
            echo 'CI/CD Pipeline completed successfully!'
            echo 'Docker container deployed successfully.'
            echo '======================================'
        }

        failure {
            echo 'Pipeline failed. Check the Jenkins console logs.'
            sh 'docker ps -a || true'
        }
    }
}
