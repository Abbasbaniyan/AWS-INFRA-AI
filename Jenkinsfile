pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out source code...'
                checkout scm
            }
        }

        stage('Test') {
            steps {
                sh 'echo Jenkins pipeline is working successfully!'
            }
        }
    }
}
