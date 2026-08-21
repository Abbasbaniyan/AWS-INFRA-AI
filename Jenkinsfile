pipeline {
    agent any

    stages {

        stage('Setup Python Environment') {
            steps {
                echo 'Setting up Python environment...'

                sh '''
                    python3 --version

                    python3 -m venv venv

                    . venv/bin/activate

                    pip install --upgrade pip

                    pip install -r requirements.txt
                '''
            }
        }

        stage('Test Application') {
            steps {
                echo 'Testing Python application...'

                sh '''
                    . venv/bin/activate

                    python3 -c "
import main
print('Application imported successfully!')
"
                '''
            }
        }

        stage('Deploy Application') {
            steps {
                echo 'Deploying application...'

                sh '''
                    pkill -f "uvicorn main:app" || true

                    nohup venv/bin/uvicorn main:app \
                    --host 0.0.0.0 \
                    --port 8000 \
                    > app.log 2>&1 &
                '''

                echo 'Application deployed successfully!'
            }
        }

        stage('Verify Deployment') {
            steps {
                echo 'Verifying application...'

                sh '''
                    sleep 5

                    curl -f http://localhost:8000/ || exit 1
                '''
            }
        }
    }

    post {
        success {
            echo 'CI/CD Pipeline completed successfully!'
        }

        failure {
            echo 'Pipeline failed. Check the logs.'
        }
    }
}
