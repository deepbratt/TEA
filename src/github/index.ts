export { GitHubClient, GitHubError, GITHUB_API, validRepoRef, type RepoSummary } from './client.js';
export { ghCliToken, startDeviceFlow, pollDeviceFlow, GITHUB_OAUTH, DEVICE_SCOPE, type DeviceCode, type DevicePoll } from './auth.js';
export { cloneRepo, type CloneOptions } from './clone.js';
