const core = require('@actions/core');
const github = require('@actions/github');

const VALID_UPDATE_ACTIONS = ['prefix', 'suffix', 'replace'];

function tryRegex(pattern) {
  try {
    return new RegExp(pattern);
  } catch (e) {
    return null;
  }
}

async function run() {
  try {
    const baseTokenRegex = /%basebranch%/g;
    const headTokenRegex = /%headbranch%/g;

    if (!github.context.payload.pull_request) {
      core.setFailed('This action only works on pull_request events');
      return;
    }

    const parsedNewlineCount = parseInt(core.getInput('body-newline-count'));

    const inputs = {
      token: core.getInput('repo-token', {required: true}),
      baseBranchRegex: core.getInput('base-branch-regex'),
      headBranchRegex: core.getInput('head-branch-regex'),
      lowercaseBranch: (core.getInput('lowercase-branch').toLowerCase() === 'true'),
      titleTemplate: core.getInput('title-template'),
      titleUpdateAction: core.getInput('title-update-action').toLowerCase(),
      titleInsertSpace: (core.getInput('title-insert-space').toLowerCase() === 'true'),
      titleUppercaseBaseMatch: (core.getInput('title-uppercase-base-match').toLowerCase() === 'true'),
      titleUppercaseHeadMatch: (core.getInput('title-uppercase-head-match').toLowerCase() === 'true'),
      bodyTemplate: core.getInput('body-template'),
      bodyUpdateAction: core.getInput('body-update-action').toLowerCase(),
      bodyNewlineCount: Number.isNaN(parsedNewlineCount) ? 2 : parsedNewlineCount,
      bodyUppercaseBaseMatch: (core.getInput('body-uppercase-base-match').toLowerCase() === 'true'),
      bodyUppercaseHeadMatch: (core.getInput('body-uppercase-head-match').toLowerCase() === 'true'),
    }

    if (!VALID_UPDATE_ACTIONS.includes(inputs.titleUpdateAction)) {
      core.setFailed(`Invalid title-update-action: '${inputs.titleUpdateAction}'. Must be one of: ${VALID_UPDATE_ACTIONS.join(', ')}`);
      return;
    }

    if (!VALID_UPDATE_ACTIONS.includes(inputs.bodyUpdateAction)) {
      core.setFailed(`Invalid body-update-action: '${inputs.bodyUpdateAction}'. Must be one of: ${VALID_UPDATE_ACTIONS.join(', ')}`);
      return;
    }

    const baseBranchRegex = inputs.baseBranchRegex.trim();
    const matchBaseBranch = baseBranchRegex.length > 0;

    const headBranchRegex = inputs.headBranchRegex.trim();
    const matchHeadBranch = headBranchRegex.length > 0;

    if (!matchBaseBranch && !matchHeadBranch) {
      core.setFailed('No branch regex values have been specified');
      return;
    }

    const matches = {
      baseMatch: '',
      headMatch: '',
    }

    if (matchBaseBranch) {
      const baseRegex = tryRegex(baseBranchRegex);
      if (!baseRegex) {
        core.setFailed(`Invalid base-branch-regex: '${baseBranchRegex}'`);
        return;
      }

      const baseBranchName = github.context.payload.pull_request.base.ref;
      const baseBranch = inputs.lowercaseBranch ? baseBranchName.toLowerCase() : baseBranchName;
      core.info(`Base branch: ${baseBranch}`);

      const baseMatches = baseBranch.match(baseRegex);
      if (!baseMatches) {
        core.setFailed('Base branch name does not match given regex');
        return;
      }

      matches.baseMatch = baseMatches[0];
      core.info(`Matched base branch text: ${matches.baseMatch}`);

      core.setOutput('baseMatch', matches.baseMatch);
    }

    if (matchHeadBranch) {
      const headRegex = tryRegex(headBranchRegex);
      if (!headRegex) {
        core.setFailed(`Invalid head-branch-regex: '${headBranchRegex}'`);
        return;
      }

      const headBranchName = github.context.payload.pull_request.head.ref;
      const headBranch = inputs.lowercaseBranch ? headBranchName.toLowerCase() : headBranchName;
      core.info(`Head branch: ${headBranch}`);

      const headMatches = headBranch.match(headRegex);
      if (!headMatches) {
        core.setFailed('Head branch name does not match given regex');
        return;
      }

      matches.headMatch = headMatches[0];
      core.info(`Matched head branch text: ${matches.headMatch}`);

      core.setOutput('headMatch', matches.headMatch);
    }

    const request = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: github.context.payload.pull_request.number,
    }

    const toCase = (shouldUpper, text) => shouldUpper ? text.toUpperCase() : text;

    const title = github.context.payload.pull_request.title || '';
    const processedTitleText = inputs.titleTemplate
      .replace(baseTokenRegex, toCase(inputs.titleUppercaseBaseMatch, matches.baseMatch))
      .replace(headTokenRegex, toCase(inputs.titleUppercaseHeadMatch, matches.headMatch));
    core.info(`Processed title text: ${processedTitleText}`);

    const updateTitle = processedTitleText.length > 0 && ({
      prefix: !title.toLowerCase().startsWith(processedTitleText.toLowerCase()),
      suffix: !title.toLowerCase().endsWith(processedTitleText.toLowerCase()),
      replace: title.toLowerCase() !== processedTitleText.toLowerCase(),
    })[inputs.titleUpdateAction];

    core.setOutput('titleUpdated', (!!updateTitle).toString());

    if (updateTitle) {
      request.title = ({
        prefix: processedTitleText.concat(inputs.titleInsertSpace ? ' ': '', title),
        suffix: title.concat(inputs.titleInsertSpace ? ' ': '', processedTitleText),
        replace: processedTitleText,
      })[inputs.titleUpdateAction];
      core.info(`New title: ${request.title}`);
    } else {
      core.warning('No updates were made to PR title');
    }

    const body = github.context.payload.pull_request.body || '';
    const processedBodyText = inputs.bodyTemplate
      .replace(baseTokenRegex, toCase(inputs.bodyUppercaseBaseMatch, matches.baseMatch))
      .replace(headTokenRegex, toCase(inputs.bodyUppercaseHeadMatch, matches.headMatch));
    core.info(`Processed body text: ${processedBodyText}`);

    const updateBody = processedBodyText.length > 0 && ({
      prefix: !body.toLowerCase().startsWith(processedBodyText.toLowerCase()),
      suffix: !body.toLowerCase().endsWith(processedBodyText.toLowerCase()),
      replace: body.toLowerCase() !== processedBodyText.toLowerCase(),
    })[inputs.bodyUpdateAction];

    core.setOutput('bodyUpdated', (!!updateBody).toString());

    if (updateBody) {
      request.body = ({
        prefix: processedBodyText.concat('\n'.repeat(inputs.bodyNewlineCount), body),
        suffix: body.concat('\n'.repeat(inputs.bodyNewlineCount), processedBodyText),
        replace: processedBodyText,
      })[inputs.bodyUpdateAction];
      core.debug(`New body: ${request.body}`);
    } else {
      core.warning('No updates were made to PR body');
    }

    if (!updateTitle && !updateBody) {
      return;
    }

    const octokit = github.getOctokit(inputs.token);
    const response = await octokit.rest.pulls.update(request);

    core.info(`Response: ${response.status}`);
    if (response.status !== 200) {
      core.error('Updating the pull request has failed');
    }
  }
  catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

run()
