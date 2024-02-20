import fs from 'fs'
import path from 'path'
import mime from 'mime'

const check_users_path = (users_path) => {
    if (!fs.existsSync(users_path)) {
        console.log('The Users folder is missing')
        process.exit(1)
    }
}

const check_groups_path = (groups_path) => {
    if (!fs.existsSync(groups_path)) {
        console.log('The Groups folder is missing')
        process.exit(1)
    }
}

export const check_paths = (google_chat_path) => {
    if (!fs.existsSync(google_chat_path)) {
        console.log('That folder does not exist')
        process.exit(1)
    }

    const groups_path = path.join(google_chat_path, 'Groups')
    check_groups_path(groups_path)

    const users_path = path.join(google_chat_path, 'Users')
    check_users_path(users_path)

    return [groups_path, users_path]
}

export const get_user_info = (users_path) => {
    // Get the path of the intermediate folder
    let intermediate_path = fs.readdirSync(users_path)

    // Check if there is only one folder inside Users
    if (intermediate_path.length === 1) {
        const user_info_path = path.join(users_path, intermediate_path[0], 'user_info.json')
        if (!fs.existsSync(user_info_path)) {
            console.log(`The user info is missing in ${user_info_path}`)
            process.exit(1)
        }

        try {
            // Return the user info as a JSON object
            return JSON.parse(fs.readFileSync(user_info_path))['user']
        } catch (error) {
            console.error('Could not read user info')
            process.exit(1)
        }

        // If there is more than one folder, exit
    } else {
        console.error('There should only be one folder inside Users')
        process.exit(1)
    }
}

const get_group_info = (group_path, user_info) => {
    // Get the path to the group info file
    const group_info_path = path.join(group_path, 'group_info.json')

    // Check if the file exists
    if (fs.existsSync(group_info_path)) {
        let data = JSON.parse(fs.readFileSync(group_info_path))

        // Remove the main user from the group info
        data.members = data.members.filter(x => {
            if (x['name'] !== user_info['name'] && x['email'] !== user_info['email']) {
                return true
            }
        })

        if (data.members.length == 0)
            return undefined;

        let name = data.name
        if (!name) {
            name = data.members.map(x => x['name']).join(", ")
        }

        // Add the path property to the group info
        return {
            'path': group_path,
            'name': name,
        }
    }
    return undefined;
}

export const get_groups_info = (groups_path, user_info) => {
    const groups = []

    // Loop through all the folders inside Groups
    for (let group of fs.readdirSync(groups_path)) {
        const current_group_path = path.join(groups_path, group)

        if (fs.existsSync(path.join(current_group_path, 'group_info.json'))) {

            // Get the group info and add it to the groups array
            const group_info = get_group_info(current_group_path, user_info)
            if (group_info !== undefined) {
                group_info['path_name'] = group
                group_info['type'] = "group"
                const parent_group = JSON.stringify(group_info)
                if (true || fs.existsSync(path.join(current_group_path, 'messages.json'))) {
                    group_info['children'] = []
                    groups.push(group_info)
                    console.log("Group", current_group_path)
                }
                for (let topic of fs.readdirSync(current_group_path)) {
                    let current_topic_path = path.join(current_group_path, topic)
                    if (fs.existsSync(path.join(current_topic_path, 'messages.json'))) {
                        console.log("Topic", current_topic_path)
                        let topic_data = JSON.parse(parent_group)
                        topic_data['type'] = "topic"
                        topic_data['path'] = current_topic_path
                        topic_data['path_name'] = topic
                        topic_data['type'] = "topic"
                        group_info['children'].push(topic_data)
                        groups.push(topic_data)
                    }
                }
            }
        }
    }

    return groups
}

const replace_bad_characters = (text) => {
    text = text.replace(/&/g, '&amp;')
    text = text.replace(/</g, '&lt;')
    text = text.replace(/>/g, '&gt;')
    text = text.replace(/"/g, '&quot;')
    text = text.replace(/'/g, '&#039;')
    text = text.replace(/\n/g, '<br />')
    return text
}

function path_name_to_id(path_name) {
    let ids = path_name.split(' ')
    return ids[ids.length-1]
}

export const create_html_index = (group_path, groups_info) => {
    let html_path = path.join(group_path, 'index.html')
    let list_messages = "<ul>"
    for (let group of groups_info) {
        if (group['type'] === "group") {
            list_messages += `<li><a href="${path_name_to_id(group['path_name'])}.html">${replace_bad_characters(group['name'])}</a></li>\n`
            // list_messages += create_message_html(topic)
        }
    }
    list_messages += "</ul>"
    fs.writeFileSync(html_path, create_html_file("Chat", list_messages))
}

export const create_html = (group_info, use_data_url) => {
    let contents = ""
    if (fs.existsSync(path.join(group_info['path'], 'messages.json'))) {
        create_message_html(group_info, group_info['path'])
    }

    let dir_path = path.join(group_info['path'], '..')
    let html_path = path.join(dir_path, path_name_to_id(group_info['path_name'])+'.html')

    if (group_info["children"] && group_info["children"].length > 0) {
        let list_messages = []
        for (let topic of group_info["children"]) {
            // list_messages += `<a href="${topic['topic']}/messages.html">${topic['name']}</a><br>`
            list_messages.push(create_message_html(topic, dir_path, use_data_url))
        }
        // Sort by last message date
        list_messages = list_messages.sort((a, b) => {
            let aa = a['messages']
            let bb = b['messages']
            // FIXME Multi-language support
            let da = aa[aa.length - 1]['created_date'].replace(/.曜日/g, '').replace(/[年月]/g, '-').replace(/[日]/g, '')
            let db = bb[bb.length - 1]['created_date'].replace(/.曜日/g, '').replace(/[年月]/g, '-').replace(/[日]/g, '')
            //console.log(da, db, Date.parse(da), Date.parse(db))
            if (Date.parse(da) < Date.parse(db)) return -1;
            return 1;
        })
        let contents = `<h1>${replace_bad_characters(group_info['name'])}</h1>\n`
        for (const topic of list_messages) {
            //contents += `<h2>${replace_bad_characters(topic.messages[0].creator.name)}</h2>\n`
            contents += `<h2>${replace_bad_characters(topic.messages[0].created_date)}</h2>\n`
            contents += topic['html']
        }
        list_messages.map(x => x['html']).join("\n")

        // Create the html file
        fs.writeFileSync(html_path, create_html_file(group_info['name'], contents))
    }

    return {
        'name': group_info['name'],
        'path': html_path
    }
}

export const create_message_html = (group_info, dir_path, use_data_url) => {
    // Read the messages of the group
    const saved_messages = JSON.parse(fs.readFileSync(path.join(group_info['path'], 'messages.json'), { encoding: 'utf-8' }))['messages']

    // Set the variables to check if the name or the day has changed
    let last_name = undefined
    let last_day = undefined

    // Add the div containing the messages
    let chat_messages = '<div class="row">'
    for (let message of saved_messages) {
        const name = (message['creator'] && message['creator']['name']) || "N/A";
        const date = message['created_date'] || ""
        //const parts = date.split(',')
        //const day = parts[1]
        //const time = parts[2]

        // Update html if the day has changed
        /*
        if (day !== last_day) {
            let chat_message_day = `<div class="col-12"><h3 class="text-center my-4">${day}</h3></div>`
            chat_messages += chat_message_day
            last_day = day
        }
        */

        // Change the name if it has changed
        if (name !== last_name) {
            chat_messages += '<div class="col-12"></div>'
            //let chat_message_title = `<div class="col-12 mt-3"><b>${name}</b> <span class="small">${time}</span></div>`
            let chat_message_title = `<div class="col-12 mt-3"><b>${name}</b> <span class="small">${date}</span></div>`
            chat_messages += chat_message_title
            last_name = name
        }

        // Get the text, sanitize it and add it to the html
        let text = message['text']
        if (text) {
            text = replace_bad_characters(text)
            let chat_message_message = `<div class="col-12 text-break">${text}</div>`
            chat_messages += chat_message_message
        }

        // Process the attached file and add it to the html
        const attached_files = message['attached_files']
        if (attached_files) {
            const file = attached_files[0]['export_name']
            let chat_message_file = process_attached_file(file, group_info, dir_path, use_data_url)
            chat_messages += chat_message_file
        }

        chat_messages += '\n'
    }
    // Close the div containing the messages
    chat_messages += '</div>'
    return {
        "html": chat_messages,
        "messages": saved_messages,
    }
}

export const create_message_html_file = (group_info, override_file) => {
    let dir_path = group_info['path']
    let chat_messages = create_message_html(group_info, dir_path).html
    let number = 0
    let html_path = path.join(dir_path, 'messages.html')

    if (!override_file) {
        while (fs.existsSync(html_path)) {
            // Get the name without the extension and the (number)
            const html_name = html_path.split('.').slice(0, -1).join('.')

            // Check if the name has a number at the end
            const match = html_name.match(/\((\d+)\)$/)

            // Update that number
            if (match) {
                number = parseInt(match[1])
                html_path = html_name.replace(/\((\d+)\)$/, `(${++number})`) + '.html'
            } else {
                html_path = `${html_name} (${++number}).html`
            }
        }
    }

    // Create the html file
    fs.writeFileSync(html_path, create_html_file(group_info['name'], chat_messages))

    return {
        'name': group_info['name'],
        'path': html_path
    }
}

let current_user = undefined
const process_attached_file = (file, group_info, dir_path, use_data_url) => {
    // Get name and extension of the file
    const extension = file.split('.').pop()
    let name = file.split('.').slice(0, -1).join('.')

    // Reset the images object if the user has changed
    if (current_user !== group_info['email']) {
        current_user = group_info['email']
        images = {}
    }

    // Change the name of the image if it has already been used
    name = update_image_name(name)

    const file_path = path.join(group_info['path'], name + '.' + extension)
    const rel_path = path.normalize(path.relative(dir_path, file_path)).split(path.sep).join('/')

    // Process each type of file
    if (is_image(file)) {
        if (!use_data_url || !fs.existsSync(file_path)) {
            return `<div class="col-12"><img style="max-width: 40%; height:auto;" class="img-thumbnail" src="${rel_path}"></div>`
        }
        let base64 = fs.readFileSync(file_path, { encoding: 'base64' })
        let mime_img = mime.getType(file_path)
        console.log("Image", mime_img)
        //return `<div class="col-12"><img style="max-width: 40%; height:auto;" class="img-thumbnail" src="${rel_path}"></div>`
        return `<div class="col-12"><img style="max-width: 40%; height:auto;" class="img-thumbnail" src="data:i${mime_img};base64,${base64}"></div>`
    }

    if (is_video(file)) {
        return `<div class="col-12"><video style="max-width: 40%; height:auto;" class="img-thumbnail" src="${rel_path}" controls></video></div>`
    }

    if (is_audio(file)) {
        return `<div class="col-12"><audio controls><source src="${rel_path}">Your browser does not support the audio element.</audio></div>`
    }

    // Generic file
    return `<div class="col-12"><a href="${rel_path}">${file}</a></div>`
}

let images = {}
const update_image_name = (image) => {
    // Add images to the object conditionally
    if (images[image] === undefined) {
        images[image] = 1
    } else {
        images[image] += 1
    }

    // Return the name with the number of times it has been used
    if (images[image] > 1) {
        return `${image}(${images[image] - 1})`
    } else {
        return image
    }
}

const is_image = (file) => {
    const images = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp']
    if (images.includes(file.split('.').pop())) {
        return true
    }
    return false
}

const is_video = (file) => {
    const videos = ['mp4', 'webm', 'ogg']
    if (videos.includes(file.split('.').pop())) {
        return true
    }
    return false
}

const is_audio = (file) => {
    const audios = ['mp3', 'wav', 'ogg', 'flac']
    if (audios.includes(file.split('.').pop())) {
        return true
    }
    return false
}

// Read the html template
const html = fs.readFileSync('group.html', { encoding: 'utf-8' })

// Replace the title and body with the ones passed as arguments
const create_html_file = (title, body) => {
    return html.replace(/{{ title }}/, title).replace(/{{ body }}/, body)
}
