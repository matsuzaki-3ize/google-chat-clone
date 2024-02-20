import path from 'path'
import minimist from 'minimist'

import { check_paths, get_user_info, get_groups_info, create_html, create_html_index } from './utils.js'

const main = () => {
    // Get the path to the Google Chat folder
    const args = minimist(process.argv.slice(2))
    const google_chat_path = args._[0]
    let use_data_url = "use-data-url" in args && args["use-data-url"];
    console.log("use_data_url", use_data_url)

    // Check if the path is valid and store the paths to the groups and users folders
    let [groups_path, users_path] = check_paths(google_chat_path)
    console.log(groups_path, users_path)

    // Get user and group info
    const user_info = get_user_info(users_path)
    const groups_info = get_groups_info(groups_path, user_info)

    // Create HTML files for each group
    const html_files = []
    for (let group_info of groups_info) {
        html_files.push(create_html(group_info, use_data_url))
    }
    create_html_index(groups_path, groups_info)

    // Print the paths to the HTML files
    console.log("converted", html_files.length)
}

main()