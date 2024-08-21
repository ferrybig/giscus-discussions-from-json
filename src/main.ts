import { Octokit } from "@octokit/core";
import makeGithubActions from "./makeGithubActions.js";
import { Command } from "commander";
import { readFile } from "fs/promises";
const program = new Command();

program
	.requiredOption("-f, --file <file>", "Specify the JSON file")
	.requiredOption("-t, --token <token>", "Specify the GitHub token")
	.requiredOption("-c, --categoryId <categoryId>", "Specify the category ID")
	.requiredOption("-o, --repoOwner <repoOwner>", "Specify the repository owner")
	.requiredOption("-r, --repoName <repoName>", "Specify the repository name")
	.requiredOption("-b, --base <url>", "Website base url");

program.parse(process.argv);

(async () => {
	const { file, token, categoryId, repoOwner, repoName, base } = program.opts();

	const data = JSON.parse(await readFile(file, "utf8"));

	const octokit = new Octokit({ auth: token });
	makeGithubActions(octokit, repoOwner, repoName, categoryId, base, data);
})().catch((error) => {
	console.error(error);
	process.exit(1);
});