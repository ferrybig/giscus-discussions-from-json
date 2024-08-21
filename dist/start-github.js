import core from '@actions/core';
import github from '@actions/github';
import { readFile } from 'fs/promises';
import makeGithubActions from './makeGithubActions.js';
(async () => {
    const jsonFile = core.getInput('file');
    const token = core.getInput('token');
    const topicId = core.getInput('topicId');
    const websiteBase = core.getInput('websiteBase') ?? '/';
    const repoOwner = core.getInput('repoOwner') ?? github.context.repo.owner;
    const repoName = core.getInput('repoName') ?? github.context.repo.repo;
    const data = JSON.parse(await readFile(jsonFile, 'utf8'));
    const octokit = github.getOctokit(token);
    makeGithubActions(octokit, repoOwner, repoName, topicId, websiteBase, data);
})().catch((error) => {
    core.setFailed(error.message);
});
