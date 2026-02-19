Enhance GitHub Actions workflow and improve UI styles

- Added a new job to create a release in the GitHub Actions workflow, ensuring proper version tagging and changelog integration.
- Updated the build jobs for desktop and Android to depend on the release creation step.
- Implemented a cleanup step for the changelog after releases.
- Improved global styles to allow text selection in inputs and adjusted component styles for better responsiveness and user experience.

chore: prevent changelog updates from GitHub Actions bot commits

