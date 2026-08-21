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
    }

    post {
        success {
            echo 'Python setup and application test successful!'
        }

        failure {
            echo 'Pipeline failed. Check the logs.'
        }
    }
}
